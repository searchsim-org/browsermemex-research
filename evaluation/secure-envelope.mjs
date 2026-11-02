// Research companion v2. Separate from legacy extension v1 checksum envelopes.
// Trusted public keys must be supplied out of band by the caller.
const encode=new TextEncoder();
export function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export async function createIdentity(){return crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);}
export async function exportEnvelope(skill,identity){
 const payload=JSON.parse(canonical(skill)),message={format:'browser-memex.skill.v2',algorithm:'Ed25519',payload};
 const bytes=await crypto.subtle.sign('Ed25519',identity.privateKey,encode.encode(canonical(message)));
 return{...message,signature:Array.from(new Uint8Array(bytes))};
}
export async function importEnvelope(envelope,trustedPublicKey){
 if(envelope?.format!=='browser-memex.skill.v2'||envelope.algorithm!=='Ed25519'||!Array.isArray(envelope.signature))throw Error('unsupported envelope');
 const message={format:envelope.format,algorithm:envelope.algorithm,payload:envelope.payload};
 if(!await crypto.subtle.verify('Ed25519',trustedPublicKey,new Uint8Array(envelope.signature),encode.encode(canonical(message))))throw Error('invalid signature or untrusted signer');
 return structuredClone(envelope.payload);
}
