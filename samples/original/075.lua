-- MoonSec V3 sample 075
-- Circular deque ops checksum
local cap = 8
local buf, lo, hi, n = {}, 1, 1, 0
for i = 1, cap do buf[i] = 0 end
local function pushL(x)
  lo = lo - 1; if lo < 1 then lo = cap end
  buf[lo] = x; n = n + 1
end
local function pushR(x)
  buf[hi] = x; hi = hi + 1; if hi > cap then hi = 1 end
  n = n + 1
end
local function popL()
  local v = buf[lo]; lo = lo + 1; if lo > cap then lo = 1 end; n = n - 1; return v
end
local function popR()
  hi = hi - 1; if hi < 1 then hi = cap end; n = n - 1; return buf[hi]
end
for i = 1, 5 do pushR(i) end
pushL(9); pushL(8)
local a, b = popR(), popL()
local s = a + b
local i = lo
for _ = 1, n do s = s + buf[i]*3; i = i + 1; if i > cap then i = 1 end end
print(s, n)

