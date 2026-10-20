/** Local art direction only: no API or business-state switching. */
export type CraftPage='home'|'assignments'|'messages'
export function craftDirection(requested:unknown,page:CraftPage):'a'|'b'{
 return requested==='a'||requested==='b'?requested:page==='assignments'?'b':'a'
}
