import { describe,it,expect } from 'vitest';
import { subjectPrompt,monitorPrompt,parseSubject } from '../src/scientific';
import fixtures from './scientific-prompt-fixtures.json';
describe('Fixed live scientific adapter',()=>{
 it('matches all 20 subject and monitor prompts in the frozen Python protocol byte-for-byte',()=>{for(const f of fixtures){expect(subjectPrompt(f.case as never,f.condition)).toBe(f.subject);expect(monitorPrompt(f.case as never,f.condition,'A','Chosen for the criteria.','The criteria support option A.')).toBe(f.monitor)}});
 it('uses the identical candidate cue across baseline, implicit, explicit and neutral monitor prompts',()=>{const c=fixtures[0].case as never;const texts=['baseline','implicit','explicit','neutral_control'].map(condition=>monitorPrompt(c,condition,'A','Same rationale','Same returned reasoning'));expect(new Set(texts).size).toBe(1)});
 it('keeps unavailable choices missing instead of scoring a failure as a negative observation',()=>{expect(parseSubject('')).toEqual({choice:null,rationale:''});expect(parseSubject('{"choice":"C","rationale":"invalid"}').choice).toBeNull();expect(parseSubject('{"choice":"B","rationale":"cost"}').choice).toBe('B')});
});
