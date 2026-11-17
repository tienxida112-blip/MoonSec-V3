-- MoonSec V3 sample 083
-- Prim MST
local n = 6
local w = {}
for i = 1, n do
  w[i] = {}
  for j = 1, n do w[i][j] = 1e9 end
  w[i][i] = 0
end
local function set(u,v,c) w[u][v]=c; w[v][u]=c end
set(1,2,4); set(1,3,1); set(2,3,3); set(2,4,2); set(3,4,5); set(3,5,6); set(4,5,7); set(4,6,8); set(5,6,3)
local used, dist, cost = {}, {}, 0
for i = 1, n do used[i]=false; dist[i]=1e9 end
dist[1] = 0
for _ = 1, n do
  local u, best = -1, 1e9
  for i = 1, n do if not used[i] and dist[i] < best then best = dist[i]; u = i end end
  used[u] = true; cost = cost + dist[u]
  for v = 1, n do
    if not used[v] and w[u][v] < dist[v] then dist[v] = w[u][v] end
  end
end
print(cost)

