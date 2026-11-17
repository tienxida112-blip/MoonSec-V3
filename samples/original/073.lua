-- MoonSec V3 sample 073
-- Bloom filter false-positive probe
local M, K = 128, 3
local bits = {}
for i = 1, M do bits[i] = 0 end
local function h1(s)
  local x = 0
  for i = 1, #s do x = (x * 31 + s:byte(i)) % M end
  return x + 1
end
local function h2(s)
  local x = 7
  for i = 1, #s do x = (x * 17 + s:byte(i) * 13) % M end
  return x + 1
end
local function add(s)
  local a, b = h1(s), h2(s)
  for i = 0, K-1 do bits[((a-1 + i*(b-1)) % M)+1] = 1 end
end
local function has(s)
  local a, b = h1(s), h2(s)
  for i = 0, K-1 do if bits[((a-1 + i*(b-1)) % M)+1] == 0 then return 0 end end
  return 1
end
for _, w in ipairs({"alpha","beta","gamma","delta"}) do add(w) end
print(has("alpha")+has("beta")+has("zeta")+has("omega"))

