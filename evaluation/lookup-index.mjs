// Optional companion configuration; snapshot source and baseline remain unchanged.
// Match every equality predicate of NuggetStore's conflict lookup.
export function configureLookupIndex(memory){
 memory.storage.exec('CREATE INDEX IF NOT EXISTS idx_nuggets_key_scope_profile ON nuggets(nugget_key,scope,profile_id)');
}
