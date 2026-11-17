-- MoonSec V3 sample 090
-- Voronoi nearest-site assignment
local sites = {{2,2},{8,1},{5,7},{1,8},{9,9}}
local W, H = 10, 10
local hist = {}
for i = 1, #sites do hist[i] = 0 end
for y = 0, H-1 do
  for x = 0, W-1 do
    local bi, bd = 1, 1e18
    for i, s in ipairs(sites) do
      local d = (x-s[1])^2 + (y-s[2])^2
      if d < bd then bd = d; bi = i end
    end
    hist[bi] = hist[bi] + 1
  end
end
local h = 0
for i = 1, #hist do h = h + hist[i] * i end
print(h)

