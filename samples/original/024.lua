-- MoonSec V3 sample 024
-- Kahn topological sort
local n = 7
local indeg, adj = {}, {}
for i = 1, n do indeg[i] = 0; adj[i] = {} end
local function edge(u,v) adj[u][#adj[u]+1] = v; indeg[v] = indeg[v] + 1 end
edge(1,3); edge(1,4); edge(2,4); edge(2,5); edge(3,6); edge(4,6); edge(4,7); edge(5,7)
local q, qh, qt, order = {}, 1, 0, {}
for i = 1, n do if indeg[i] == 0 then qt = qt + 1; q[qt] = i end end
while qh <= qt do
  local u = q[qh]; qh = qh + 1; order[#order+1] = u
  for _, v in ipairs(adj[u]) do
    indeg[v] = indeg[v] - 1
    if indeg[v] == 0 then qt = qt + 1; q[qt] = v end
  end
end
print(table.concat(order, "-"))

