-- MoonSec V3 sample 056
-- Recursive-backtracker maze, then corridor count
local W, H = 11, 9
local vis, N = {}, W*H
for i = 1, N do vis[i] = false end
local function id(x,y) return (y-1)*W + x end
local walls = 0
local st = {{1,1}}
vis[id(1,1)] = true
local dirs = {{1,0},{-1,0},{0,1},{0,-1}}
while #st > 0 do
  local c = st[#st]
  local nbr = {}
  for _, d in ipairs(dirs) do
    local nx, ny = c[1]+d[1], c[2]+d[2]
    if nx>=1 and nx<=W and ny>=1 and ny<=H and not vis[id(nx,ny)] then
      nbr[#nbr+1] = {nx,ny}
    end
  end
  if #nbr == 0 then st[#st] = nil
  else
    local k = 1 + ((c[1]*13 + c[2]*7 + #st) % #nbr)
    local n = nbr[k]
    vis[id(n[1], n[2])] = true
    walls = walls + 1
    st[#st+1] = n
  end
end
local seen = 0
for i = 1, N do if vis[i] then seen = seen + 1 end end
print(seen, walls)

