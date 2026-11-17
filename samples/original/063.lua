-- MoonSec V3 sample 063
-- Rule 110 elementary CA checksum
local W, GENS = 80, 50
local row = {}
for i = 1, W do row[i] = 0 end
row[W] = 1
local function bit(L,C,R)
  local idx = L*4 + C*2 + R
  -- rule 110: 01101110
  local t = {0,1,1,1,0,1,1,0}
  return t[idx+1]
end
local sum = 0
for g = 1, GENS do
  local n = {}
  for i = 1, W do
    local L = row[i==1 and W or i-1]
    local R = row[i==W and 1 or i+1]
    n[i] = bit(L, row[i], R)
    sum = sum + n[i] * ((g+i) % 13)
  end
  row = n
end
print(sum)

