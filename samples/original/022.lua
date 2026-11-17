-- MoonSec V3 sample 022
-- Dijkstra from node 1
local n = 8
local adj = {}
for i = 1, n do adj[i] = {} end
local function add(u,v,w) adj[u][#adj[u]+1] = {v,w}; adj[v][#adj[v]+1] = {u,w} end
add(1,2,4); add(1,3,2); add(2,3,1); add(2,4,5); add(3,4,8); add(3,5,10)
add(4,5,2); add(4,6,6); add(5,6,3); add(5,7,7); add(6,8,4); add(7,8,1)
local dist, used = {}, {}
for i = 1, n do dist[i] = 1e9; used[i] = false end
dist[1] = 0
for _ = 1, n do
  local u, best = -1, 1e9
  for i = 1, n do if not used[i] and dist[i] < best then best = dist[i]; u = i end end
  if u < 0 then break end
  used[u] = true
  for _, e in ipairs(adj[u]) do
    local v, w = e[1], e[2]
    if dist[u] + w < dist[v] then dist[v] = dist[u] + w end
  end
end
local s = 0
for i = 1, n do s = s + dist[i] end
print(s)

