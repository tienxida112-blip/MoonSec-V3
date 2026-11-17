-- MoonSec V3 sample 026
-- Tarjan SCC count
local n = 8
local adj = {}
for i = 1, n do adj[i] = {} end
local function e(u,v) adj[u][#adj[u]+1] = v end
e(1,2); e(2,3); e(3,1); e(3,4); e(4,5); e(5,4); e(5,6); e(6,7); e(7,6); e(7,8)
local idx, low, on, st, time, scc = {}, {}, {}, {}, 0, 0
for i = 1, n do idx[i] = -1; low[i] = 0; on[i] = false end
local function dfs(u)
  time = time + 1; idx[u] = time; low[u] = time
  st[#st+1] = u; on[u] = true
  for _, v in ipairs(adj[u]) do
    if idx[v] < 0 then dfs(v); low[u] = math.min(low[u], low[v])
    elseif on[v] then low[u] = math.min(low[u], idx[v]) end
  end
  if low[u] == idx[u] then
    scc = scc + 1
    while true do
      local x = st[#st]; st[#st] = nil; on[x] = false
      if x == u then break end
    end
  end
end
for i = 1, n do if idx[i] < 0 then dfs(i) end end
print(scc)

