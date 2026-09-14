import fs from 'node:fs/promises';
const root='research/persona-discovery';
const config=await fs.readFile(root+'/discovery-contract.json','utf8');
const runner=await fs.readFile(root+'/kaggle_discovery.py','utf8');
const cell=source=>({cell_type:'code',execution_count:null,metadata:{},outputs:[],source:source.split(/(?<=\n)/)});
const notebook={nbformat:4,nbformat_minor:5,metadata:{kernelspec:{display_name:'Python 3',language:'python',name:'python3'},language_info:{name:'python',version:'3.11'}},cells:[
 {cell_type:'markdown',metadata:{},source:['# Unsupervised persona discovery\n','Discovery and causal feature screening for the Persona Vectors limitation. This notebook does not produce confirmatory persona claims.\n','Protocol: https://github.com/RaphaelKhalid/afterlight/blob/main/research/persona-discovery/PROTOCOL.md\n','Requires two T4 GPUs. No provider API keys or paid model API calls.']},
 cell("import subprocess, sys\nsubprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', 'transformers==4.56.2', 'accelerate==1.10.1', 'datasets==4.1.1', 'huggingface-hub==0.34.4'])\n"),
 cell('from pathlib import Path\nPath("discovery-contract.json").write_text('+JSON.stringify(config.replace(/^\uFEFF/,''))+', encoding="utf-8")\nPath("kaggle_discovery.py").write_text('+JSON.stringify(runner.replace(/^\uFEFF/,''))+', encoding="utf-8")\n'),
 cell("subprocess.check_call([sys.executable, 'kaggle_discovery.py'])\n")
]};
await fs.mkdir(root+'/kaggle',{recursive:true});
await fs.writeFile(root+'/kaggle/unsupervisedsaes.ipynb',JSON.stringify(notebook,null,2));
await fs.writeFile(root+'/kaggle/kernel-metadata.json',JSON.stringify({id:'raphaelkhalid0/unsupervisedsaes',id_no:134397358,title:'UnsupervisedSAEs',code_file:'unsupervisedsaes.ipynb',language:'python',kernel_type:'notebook',is_private:true,enable_gpu:true,enable_internet:true,machine_shape:'NvidiaTeslaT4',dataset_sources:[],competition_sources:[],kernel_sources:[],model_sources:[]},null,2));
console.log('Built private Kaggle notebook with frozen discovery contract.');
