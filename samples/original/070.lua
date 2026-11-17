-- MoonSec V3 sample 070
-- Ordinary least squares
local xs = {1,2,3,4,5,6,7,8}
local ys = {2.1,3.9,6.2,8.0,9.8,12.1,14.2,15.9}
local n, sx, sy, sxx, sxy = #xs, 0, 0, 0, 0
for i = 1, n do
  sx = sx + xs[i]; sy = sy + ys[i]
  sxx = sxx + xs[i]*xs[i]; sxy = sxy + xs[i]*ys[i]
end
local b = (n*sxy - sx*sy) / (n*sxx - sx*sx)
local a = (sy - b*sx) / n
print(math.floor(a*1000+0.5), math.floor(b*1000+0.5))

