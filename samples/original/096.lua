-- MoonSec V3 sample 096
-- Continued fraction of sqrt(19) period checksum
local S = 19
local a0 = math.floor(math.sqrt(S))
local m, d, a = 0, 1, a0
local seen, period, h = {}, 0, 0
for i = 1, 40 do
  m = d * a - m
  d = math.floor((S - m*m) / d)
  a = math.floor((a0 + m) / d)
  h = (h * 10 + a) % 1000003
  local key = m..":"..d..":"..a
  if seen[key] then period = i - seen[key]; break end
  seen[key] = i
end
print(h, period)

