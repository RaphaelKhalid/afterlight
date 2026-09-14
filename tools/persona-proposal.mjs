import fs from 'node:fs/promises';
export const papers = [
 {id:'2507.21509',title:'Persona Vectors: Monitoring and Controlling Character Traits in Language Models',authors:['Runjin Chen','Andy Arditi','Henry Sleight','Owain Evans','Jack Lindsey'],published:'2025-07-29',updated:'2025-09-05',url:'https://arxiv.org/abs/2507.21509v3',version:'v3',sourceType:'paper',abstract:'Introduces prompt-elicited persona vectors for monitoring and controlling character traits. The limitations propose unsupervised SAE discovery, while Appendix M decomposes previously identified persona vectors.',topics:['Persona discovery','Sparse autoencoders'],verificationStatus:'Primary source reviewed',featured:false},
 {id:'2512.23988',title:'Fantastic Reasoning Behaviors and Where to Find Them: Unsupervised Discovery of the Reasoning Process',authors:['Zhenyu Zhang','Shujian Zhang','John Lambert','Wenxuan Zhou','Zhangyang Wang','Mingqing Chen','Andrew Hard','Rajiv Mathews','Lun Wang'],published:'2025-12-30',url:'https://arxiv.org/abs/2512.23988v1',version:'v1',sourceType:'paper',abstract:'RISE studies SAE features of reasoning behavior. It is related methodological work; it does not establish the proposed comparison between discovered persona features and prompt-elicited persona vectors.',topics:['Persona discovery','Sparse autoencoders'],verificationStatus:'Primary source reviewed',featured:false}
];
export const question = {
 id:'q-unsupervised-persona',title:'Can SAEs reveal persona tendencies that prompting struggles to recover?',area:'Persona discovery',status:'Unassessed',origin:'user-proposed',
 summary:'Reuse a published SAE on Qwen2.5-7B-Instruct to discover candidate behavioral directions without selecting trait labels first. Test whether those directions cause consistent changes on fresh scenarios, and compare them with optimized prompting and prompt-extracted persona vectors.',
 whyItMatters:'The original method needs a named trait that the model can express when prompted. This experiment asks whether label-free feature selection can reveal a useful behavioral direction outside what that extraction procedure reliably recovers. Discovery of a candidate is not proof of a new persona.',
 source:{paperId:'2507.21509',url:'https://arxiv.org/html/2507.21509v3#S8',version:'v3',section:'Section 8, Supervised, prompt-elicited extraction; Appendix M',passage:'SAEs may therefore enable unsupervised discovery of persona-relevant directions, including specific traits that cannot be easily elicited through prompting.'},
 closestWork:[{paperId:'2507.21509',finding:'Appendix M studies SAE features associated with existing persona vectors.',mismatch:'Selecting features from already named trait vectors does not test discovery without a trait target.'},{paperId:'2512.23988',finding:'RISE explores reasoning behaviors using sparse autoencoders.',mismatch:'Reasoning behavior discovery does not establish generalizable persona effects that outperform a strong prompt-extraction baseline.'}],
 uncertainty:'This is a proposed extension, not an established open problem or a novelty claim. Candidate names, rubrics, steering strengths and baselines must be frozen using development data before confirmation. The Kaggle runner is separate from the existing API experiment evaluator. No persona-discovery results are available yet.',
 search:{date:'2026-09-14',queries:[],coverage:'Targeted review of the supplied Persona Vectors limitation and RISE; not a systematic literature search.',inaccessible:['Novelty has not been established by an exhaustive search.']},
 executable:false,access:'Kaggle GPU study; evaluator and confirmation contract pending',position:{x:39,y:33},evidenceIds:[]
};
export function addPersonaProposal(corpus) {
 for(const paper of papers) {const i=corpus.papers.findIndex(p=>p.id===paper.id); if(i<0)corpus.papers.push(paper);else corpus.papers[i]=paper;}
 const i=corpus.questions.findIndex(q=>q.id===question.id);if(i<0)corpus.questions.push(question);else corpus.questions[i]=question;
 const edges=papers.map((p,i)=>({id:`persona-${p.id}`,source:p.id,target:question.id,type:i?'methodologically adjacent':'raises',explanation:i?question.closestWork[1].mismatch:'The authors propose SAE-based unsupervised discovery as a possible extension; this exact experiment is user-proposed.',evidenceUrl:p.url}));
 for(const e of edges){const i=corpus.edges.findIndex(x=>x.id===e.id);if(i<0)corpus.edges.push(e);else corpus.edges[i]=e;}
 corpus.coverage={...corpus.coverage,paperCount:corpus.papers.length,questionCount:corpus.questions.length,foundationCount:corpus.papers.filter(p=>!p.featured).length,note:'A selected monitorability collection, with a user-proposed persona-discovery extension and two supporting papers. The persona proposal has a targeted source review and no results. This is not a comprehensive map of AI safety.'};
 return corpus;
}
if(process.argv.includes('--apply')) {
 for(const file of ['public/data/corpus.json','artifacts/sources/corpus.json']) {const c=JSON.parse(await fs.readFile(file,'utf8'));await fs.writeFile(file,JSON.stringify(addPersonaProposal(c),null,2)+'\n');}
}
