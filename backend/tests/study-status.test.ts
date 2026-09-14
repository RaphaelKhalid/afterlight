import assert from 'node:assert/strict';
import test from 'node:test';
import { validateStudyStatus } from '../src/study-status.ts';
const valid={status:'running',phase:'discovery',completed:4,total:1024,updatedAt:'2026-09-14T00:00:00Z',message:'Four recorded responses',telemetry:'notebook-log'};
test('accepts measured status and fixes public provenance links',()=>{const x=validateStudyStatus({...valid,notebookUrl:'https://evil.example',secret:'discard'});assert(x);assert.equal(x.completed,4);assert.equal(x.notebookUrl,'https://www.kaggle.com/code/raphaelkhalid0/unsupervisedsaes');assert.equal('secret' in x,false);});
test('rejects impossible counters and invalid provenance fields',()=>{for(const v of [{...valid,completed:1025},{...valid,total:-1},{...valid,completed:0.5},{...valid,updatedAt:'never'},{...valid,telemetry:'guessed'},{...valid,message:'x'.repeat(1201)}])assert.equal(validateStudyStatus(v),null);});
