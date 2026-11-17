-- MoonSec V3 sample 054
-- Graham-like convex hull monotone chain
local pts = {{0,0},{1,1},{2,2},{0,2},{2,0},{1,0},{1,2},{0.5,0.5},{1.5,1.2}}
table.sort(pts, function(a,b) if a[1]==b[1] then return a[2]<b[2] else return a[1]<b[1] end end)
local function cross(o,a,b)
  return (a[1]-o[1])*(b[2]-o[2]) - (a[2]-o[2])*(b[1]-o[1])
end
local lower = {}
for i = 1, #pts do
  while #lower >= 2 and cross(lower[#lower-1], lower[#lower], pts[i]) <= 0 do
    lower[#lower] = nil
  end
  lower[#lower+1] = pts[i]
end
local upper = {}
for i = #pts, 1, -1 do
  while #upper >= 2 and cross(upper[#upper-1], upper[#upper], pts[i]) <= 0 do
    upper[#upper] = nil
  end
  upper[#upper+1] = pts[i]
end
print(#lower + #upper - 2)

