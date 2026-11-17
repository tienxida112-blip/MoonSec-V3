-- MoonSec V3 sample 057
-- A* on a small grid with obstacles
local W, H = 8, 8
local blocked = {}
for _, p in ipairs({{3,3},{3,4},{3,5},{5,2},{5,3},{6,6}}) do
  blocked[p[1]..","..p[2]] = true
end
local function key(x,y) return x..","..y end
local function heur(x,y) return math.abs(x-W) + math.abs(y-H) end
local open, g, came = {{1,1}}, {}, {}
g[key(1,1)] = 0
local found = 0
while #open > 0 do
  local bi = 1
  for i = 2, #open do
    local a, b = open[i], open[bi]
    if (g[key(a[1],a[2])] or 1e9) + heur(a[1],a[2]) < (g[key(b[1],b[2])] or 1e9) + heur(b[1],b[2]) then bi = i end
  end
  local c = table.remove(open, bi)
  if c[1] == W and c[2] == H then found = g[key(c[1],c[2])]; break end
  for _, d in ipairs({{1,0},{-1,0},{0,1},{0,-1}}) do
    local nx, ny = c[1]+d[1], c[2]+d[2]
    if nx>=1 and nx<=W and ny>=1 and ny<=H and not blocked[key(nx,ny)] then
      local ng = (g[key(c[1],c[2])] or 1e9) + 1
      local nk = key(nx,ny)
      if ng < (g[nk] or 1e9) then
        g[nk] = ng
        open[#open+1] = {nx,ny}
      end
    end
  end
end
print(found)

