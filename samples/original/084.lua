-- MoonSec V3 sample 084
-- Counting sort of bounded ints
local a = {4,2,2,8,3,3,1,0,9,4,5,5,7,6,1}
local mx = 0
for i = 1, #a do if a[i] > mx then mx = a[i] end end
local cnt = {}
for i = 0, mx do cnt[i] = 0 end
for i = 1, #a do cnt[a[i]] = cnt[a[i]] + 1 end
local k = 1
for v = 0, mx do
  for _ = 1, cnt[v] do a[k] = v; k = k + 1 end
end
local s = 0
for i = 1, #a do s = s + a[i] * i end
print(s)

