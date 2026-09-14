"""Kaggle discovery phase. No provider credentials or paid API calls."""
import os
os.environ['HF_HOME'] = '/kaggle/temp/persona-hf'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import hashlib, json, time, platform, traceback, sys, math
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F
from datasets import load_dataset
from huggingface_hub import hf_hub_download
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path('/kaggle/working/persona-discovery')
ROOT.mkdir(parents=True, exist_ok=True)
C = json.loads(Path('discovery-contract.json').read_text(encoding='utf-8-sig'))
START = time.monotonic()
CONTRACT_HASH = hashlib.sha256(json.dumps(C, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def save(name, value):
    p = ROOT / name
    temp = p.with_suffix(p.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding='utf-8')
    temp.replace(p)

def event(status, phase, completed, total, message):
    row = dict(status=status, phase=phase, completed=completed, total=total,
               message=message, updatedAt=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               contractHash=CONTRACT_HASH, elapsedSeconds=round(time.monotonic()-START, 2))
    save('status.json', row)
    with (ROOT/'events.jsonl').open('a', encoding='utf-8') as f:
        f.write(json.dumps(row)+'\n')
    print(json.dumps(row), flush=True)

def check_time():
    if time.monotonic()-START > C['maxRuntimeSeconds']:
        raise TimeoutError('Internal resource limit reached; preserve incomplete phase outputs.')

def append(name, rows):
    with (ROOT/name).open('a', encoding='utf-8') as f:
        for row in rows: f.write(json.dumps(row, ensure_ascii=False)+'\n')

def file_hash(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for chunk in iter(lambda:f.read(8*1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def main():
    save('contract.json', C)
    assert torch.cuda.device_count() >= 2, 'This frozen runner requires two GPUs; do not silently change precision or model.'
    event('running','loading',0,C['discoveryN'],'Loading pinned model and SAE; no results yet.')
    import transformers, datasets, huggingface_hub
    save('environment.json', dict(python=sys.version,platform=platform.platform(),torch=torch.__version__,
        transformers=transformers.__version__,datasets=datasets.__version__,huggingface_hub=huggingface_hub.__version__,
        gpu=[dict(name=torch.cuda.get_device_name(i),memory=torch.cuda.get_device_properties(i).total_memory) for i in range(torch.cuda.device_count())]))
    tokenizer=AutoTokenizer.from_pretrained(C['model'],revision=C['modelRevision'],padding_side='left')
    tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(C['model'],revision=C['modelRevision'],torch_dtype=torch.float16,
        device_map='balanced',max_memory={0:'11GiB',1:'11GiB'},attn_implementation='sdpa').eval()
    assert not any(str(v) in ('cpu','disk') for v in model.hf_device_map.values()), 'Unexpected CPU offload.'
    layer=model.model.layers[C['layer']]
    sae_device=next(layer.parameters()).device
    checkpoint=hf_hub_download(C['sae'],C['saeFolder']+'/ae.pt',revision=C['saeRevision'])
    config_path=hf_hub_download(C['sae'],C['saeFolder']+'/config.json',revision=C['saeRevision'])
    save('sae-config.json',json.loads(Path(config_path).read_text()))
    state=torch.load(checkpoint,map_location='cpu',weights_only=True)
    assert tuple(state['encoder.weight'].shape)==(131072,3584)
    assert tuple(state['decoder.weight'].shape)==(3584,131072)
    assert int(state['k'])==64 and float(state['threshold'])>=0
    sae={k:v.to(sae_device,torch.float16) for k,v in state.items() if k in ('encoder.weight','encoder.bias','decoder.weight','b_dec','threshold')}
    del state
    save('provenance.json',dict(contractHash=CONTRACT_HASH,saeSha256=file_hash(checkpoint),saeDevice=str(sae_device),
        deviceMap={k:str(v) for k,v in model.hf_device_map.items()},modelRevision=C['modelRevision'],saeRevision=C['saeRevision'],datasetRevision=C['datasetRevision'],
        activationConvention='decoder layer index 19 output; generated assistant token positions; every fourth token; threshold inference',precision='float16 model and SAE'))
    source=load_dataset(C['dataset'],revision=C['datasetRevision'],split=C['datasetSplit'],streaming=True).shuffle(seed=C['seed'],buffer_size=10000)
    cases=[]; seen=set()
    for record in source:
        check_time()
        messages=record.get('messages',[])
        if not messages or messages[0].get('role')!='user': continue
        prompt=messages[0]['content'].strip()
        key=hashlib.sha256(prompt.encode()).hexdigest()
        if key in seen or not 20 <= len(prompt) <= 2400: continue
        text=tokenizer.apply_chat_template([{'role':'system','content':'You are a helpful assistant.'},{'role':'user','content':prompt}],tokenize=False,add_generation_prompt=True)
        if len(tokenizer.encode(text,add_special_tokens=False)) > C['maxInputTokens']: continue
        seen.add(key)
        cases.append(dict(id=key,prompt=prompt,sourceId=record.get('prompt_id'),text=text,
            split='discovery' if len(cases)<C['discoveryN'] else 'development-screen'))
        if len(cases)==C['discoveryN']+C['screenScenarios']: break
    assert len(cases)==C['discoveryN']+C['screenScenarios'], 'Insufficient eligible cases.'
    save('cases.json',cases)
    input_device=model.get_input_embeddings().weight.device
    feature_means=np.lib.format.open_memmap(ROOT/'feature-means.npy',mode='w+',dtype=np.float32,shape=(C['discoveryN'],131072))
    feature_means[:]=np.nan
    norms=[]; diagnostics=[]

    def generate(batch,seed,max_new,direction=None):
        check_time()
        torch.manual_seed(seed);torch.cuda.manual_seed_all(seed)
        inputs=tokenizer([x['text'] for x in batch],padding=True,return_tensors='pt',add_special_tokens=False).to(input_device)
        hook=None
        if direction is not None:
            def intervene(_module,_args,output):
                h=output[0] if isinstance(output,tuple) else output
                shifted=h+direction.to(device=h.device,dtype=h.dtype)
                return (shifted,)+output[1:] if isinstance(output,tuple) else shifted
            hook=layer.register_forward_hook(intervene)
        try:
            with torch.inference_mode():
                ids=model.generate(**inputs,max_new_tokens=max_new,do_sample=True,temperature=C['temperature'],top_p=C['topP'],
                    pad_token_id=tokenizer.pad_token_id,eos_token_id=tokenizer.eos_token_id)
        finally:
            if hook is not None: hook.remove()
        prompt_width=inputs.input_ids.shape[1]
        rows=[];lens=[]
        for case,tokens in zip(batch,ids[:,prompt_width:]):
            values=tokens.tolist()
            end=next((i+1 for i,t in enumerate(values) if t==tokenizer.eos_token_id),len(values))
            lens.append(end)
            rows.append(dict(caseId=case['id'],prompt=case['prompt'],output=tokenizer.decode(values[:end],skip_special_tokens=True),
                generatedTokenIds=values[:end],generatedTokens=end,truncated=(end==max_new and values[end-1]!=tokenizer.eos_token_id),
                seed=seed,seedScope='batch',maxNewTokens=max_new,temperature=C['temperature'],topP=C['topP']))
        return inputs,ids,prompt_width,lens,rows

    def analyze(inputs,ids,width,lens):
        captured=[]
        handle=layer.register_forward_hook(lambda _m,_i,o: captured.append((o[0] if isinstance(o,tuple) else o).detach()))
        mask=torch.cat([inputs.attention_mask,torch.zeros((len(lens),ids.shape[1]-width),device=input_device,dtype=inputs.attention_mask.dtype)],dim=1)
        for i,n in enumerate(lens): mask[i,width:width+n]=1
        positions=(mask.cumsum(-1)-1).clamp(min=0)
        try:
            with torch.inference_mode(): model(ids,attention_mask=mask,position_ids=positions,use_cache=False)
        finally: handle.remove()
        outputs=[]
        for i,n in enumerate(lens):
            h=captured[0][i,width:width+n:C['saeTokenStride']]
            hn=h.float().norm(dim=-1); valid=hn <= 10*hn.median()
            h=h[valid];hn=hn[valid]
            assert h.numel()>0 and torch.isfinite(h).all(), 'Invalid sampled activations.'
            with torch.inference_mode():
                f=F.relu(F.linear(h-sae['b_dec'],sae['encoder.weight'],sae['encoder.bias']))
                f=f*(f>sae['threshold'])
                recon=F.linear(f,sae['decoder.weight'])+sae['b_dec']
                assert torch.isfinite(f).all() and torch.isfinite(recon).all(), 'Non-finite SAE output.'
                mean=f.float().mean(0).cpu().numpy()
                l0=float((f>0).sum(-1).float().mean())
                error=float(((h.float()-recon.float()).square().sum(-1)/(h.float().square().sum(-1)+1e-8)).mean())
            outputs.append((mean,hn.cpu().tolist(),dict(sampledTokens=int(h.shape[0]),outliersExcluded=int((~valid).sum()),meanActiveFeatures=l0,relativeSquaredReconstructionError=error)))
        return outputs

    for start in range(0,C['discoveryN'],C['batchSize']):
        batch=cases[start:start+C['batchSize']]
        inputs,ids,width,lens,rows=generate(batch,C['seed']+start,C['discoveryMaxNewTokens'])
        values=analyze(inputs,ids,width,lens)
        for offset,(mean,ns,diag) in enumerate(values):
            feature_means[start+offset]=mean;norms.extend(ns)
            diag['caseId']=batch[offset]['id'];diagnostics.append(diag)
        feature_means.flush()
        append('discovery-responses.jsonl',rows);append('activation-diagnostics.jsonl',[x[2] for x in values])
        event('running','discovery',start+len(batch),C['discoveryN'],'Collecting responses and SAE activations; no confirmed persona finding.')
    assert np.isfinite(feature_means).all()
    mean=np.mean(feature_means,axis=0,dtype=np.float64)
    variance=np.var(feature_means,axis=0,dtype=np.float64)
    occurrence=np.mean(feature_means>0,axis=0)
    scores=variance/(mean**2+1e-8)
    eligible=(occurrence>=C['featureMinOccurrence'])&(occurrence<=C['featureMaxOccurrence'])&np.isfinite(scores)
    np.savez_compressed(ROOT/'all-feature-statistics.npz',mean=mean,variance=variance,occurrence=occurrence,score=scores,eligible=eligible)
    order=sorted(np.where(eligible)[0],key=lambda i:(-scores[i],int(i)))
    chosen=[];vectors=[];decisions=[]
    for idx in order:
        vector=sae['decoder.weight'][:,int(idx)].float();vector=vector/vector.norm()
        similarity=max([abs(float(torch.dot(vector,v))) for v in vectors],default=0)
        if similarity>C['maxDecoderCosine']:
            decisions.append(dict(feature=int(idx),decision='rejected-correlated',cosine=similarity));continue
        chosen.append(int(idx));vectors.append(vector)
        decisions.append(dict(feature=int(idx),decision='selected',score=float(scores[idx]),occurrence=float(occurrence[idx])))
        if len(chosen)==C['screenFeatures']:break
    save('selection.json',dict(features=chosen,decisions=decisions,eligibleCount=int(eligible.sum()),
         method='prompt-level coefficient of variation squared; occurrence filter; decoder cosine diversity',traitLabelsUsed=False))
    if not chosen: raise ValueError('No eligible features. Report negative discovery outcome; no fallback selection.')
    median_norm=float(np.median(norms));amplitude=median_norm*C['screenNormFraction']
    save('screen-configuration.json',dict(features=chosen,amplitude=amplitude,medianResidualNorm=median_norm,
          conditions=['baseline','sae-positive','sae-negative'],developmentOnly=True))
    for idx in chosen:
        top=np.argsort(feature_means[:,idx])[-10:][::-1]
        save('feature-'+str(idx)+'-examples.json',[dict(caseId=cases[int(i)]['id'],meanActivation=float(feature_means[i,idx])) for i in top])
    dev=cases[C['discoveryN']:]
    total=len(dev)*(1+2*len(chosen));completed=0
    conditions=[('baseline',None,None)]+[(sign,idx,v*amplitude*mult) for idx,v in zip(chosen,vectors) for sign,mult in [('sae-positive',1),('sae-negative',-1)]]
    for condition,feature,direction in conditions:
        for start in range(0,len(dev),C['batchSize']):
            _,_,_,_,rows=generate(dev[start:start+C['batchSize']],C['seed']+100000+start,C['screenMaxNewTokens'],direction)
            for row in rows:row.update(condition=condition,feature=feature,amplitude=0 if direction is None else amplitude,phase='development-screen')
            append('screen-responses.jsonl',rows);completed+=len(rows)
            event('running','development-screen',completed,total,'Causal feature screen; candidate interpretation and confirmation remain pending.')
    event('completed','discovery-and-development-screen',completed,total,'Discovery phase complete. No confirmation results; freeze candidate rubrics and baselines next.')
    save('artifact-hashes.json',{p.name:file_hash(p) for p in ROOT.iterdir() if p.is_file() and p.name!='artifact-hashes.json'})

if __name__=='__main__':
    try: main()
    except Exception as e:
        previous=json.loads((ROOT/'status.json').read_text()) if (ROOT/'status.json').exists() else {}
        event('incomplete' if isinstance(e,TimeoutError) else 'failed',previous.get('phase','initialization'),previous.get('completed',0),previous.get('total',C['discoveryN']),str(e))
        (ROOT/'error.txt').write_text(traceback.format_exc(),encoding='utf-8')
        raise
