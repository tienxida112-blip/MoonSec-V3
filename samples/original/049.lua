-- MoonSec V3 sample 049
-- Run-length encode/decode
local src = {1,1,1,2,2,3,3,3,3,1,1,4,5,5,5,5,5}
local enc, i = {}, 1
while i <= #src do
  local v, n = src[i], 1
  while i+n <= #src and src[i+n] == v do n = n + 1 end
  enc[#enc+1] = n; enc[#enc+1] = v; i = i + n
end
local dec = {}
for k = 1, #enc, 2 do
  for _ = 1, enc[k] do dec[#dec+1] = enc[k+1] end
end
local ok = (#dec == #src) and 1 or 0
for j = 1, #src do if dec[j] ~= src[j] then ok = 0 end end
print(#enc, ok)

