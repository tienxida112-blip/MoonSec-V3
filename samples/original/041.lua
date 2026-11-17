-- MoonSec V3 sample 041
-- Simpson integrate sin
local a, b, n = 0, math.pi, 20
local h = (b-a)/n
local s = math.sin(a) + math.sin(b)
for i = 1, n-1 do
  local x = a + i*h
  if i % 2 == 0 then s = s + 2 * math.sin(x) else s = s + 4 * math.sin(x) end
end
print(math.floor(s * h / 3 * 100000 + 0.5))

