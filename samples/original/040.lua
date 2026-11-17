-- MoonSec V3 sample 040
-- Bisection root of x^3 - x - 2
local function f(x) return x*x*x - x - 2 end
local a, b = 1, 2
for _ = 1, 40 do
  local m = (a+b)/2
  if f(a)*f(m) <= 0 then b = m else a = m end
end
print(math.floor(((a+b)/2) * 100000 + 0.5))

