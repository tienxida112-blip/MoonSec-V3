-- MoonSec V3 sample 039
-- RK4 for y'=y, y(0)=1 over a few steps
local function f(t, y) return y end
local t, y, h, n = 0, 1, 0.1, 10
for i = 1, n do
  local k1 = f(t, y)
  local k2 = f(t + h/2, y + h*k1/2)
  local k3 = f(t + h/2, y + h*k2/2)
  local k4 = f(t + h, y + h*k3)
  y = y + h * (k1 + 2*k2 + 2*k3 + k4) / 6
  t = t + h
end
print(math.floor(y * 10000 + 0.5), math.floor(math.exp(1) * 10000 + 0.5))

