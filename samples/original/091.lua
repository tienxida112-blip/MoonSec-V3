-- MoonSec V3 sample 091
-- Shell sort with gaps
local a = {23,12,1,8,17,5,19,4,16,2,11,7,20,3,14}
local n = #a
local gap = math.floor(n/2)
while gap > 0 do
  for i = gap+1, n do
    local tmp, j = a[i], i
    while j > gap and a[j-gap] > tmp do
      a[j] = a[j-gap]; j = j - gap
    end
    a[j] = tmp
  end
  gap = math.floor(gap/2)
end
local s = 0
for i = 1, n do s = s + a[i]*i end
print(s, a[1], a[n])

