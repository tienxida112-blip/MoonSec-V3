-- MoonSec V3 sample 053
-- 1D Perlin-ish interpolated noise energy
local perm = {}
for i = 0, 15 do perm[i] = (i * 7 + 3) % 16 end
local function fade(t) return t*t*t*(t*(t*6-15)+10) end
local function lerp(a,b,t) return a + t*(b-a) end
local function grad(h, x) if h % 2 == 0 then return x else return -x end end
local function noise(x)
  local xi = math.floor(x)
  local xf = x - xi
  local u = fade(xf)
  local a = perm[xi % 16]
  local b = perm[(xi+1) % 16]
  return lerp(grad(a, xf), grad(b, xf-1), u)
end
local e = 0
for i = 0, 40 do
  local v = noise(i * 0.15)
  e = e + v * v
end
print(math.floor(e * 100000 + 0.5))

