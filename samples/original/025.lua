-- MoonSec V3 sample 025
-- BFS bipartite check + distances
local n = 9
local adj = {}
for i = 1, n do adj[i] = {} end
local function e(u,v) adj[u][#adj[u]+1]=v; adj[v][#adj[v]+1]=u end
e(1,2); e(1,3); e(2,4); e(3,5); e(4,6); e(5,6); e(6,7); e(7,8); e(8,9)
local col, dist = {}, {}
for i = 1, n do col[i] = 0; dist[i] = -1 end
local q = {1}; dist[1] = 0; col[1] = 1
local qi, bip = 1, 1
while qi <= #q do
  local u = q[qi]; qi = qi + 1
  for _, v in ipairs(adj[u]) do
    if col[v] == 0 then
      col[v] = 3 - col[u]; dist[v] = dist[u] + 1; q[#q+1] = v
    elseif col[v] == col[u] then bip = 0 end
  end
end
local s = 0
for i = 1, n do s = s + (dist[i] or 0) * col[i] end
print(bip, s)

