-- MoonSec V3 sample 042
-- TEA block cipher 2-round checksum
local function tea(v0, v1, k)
  local sum, delta = 0, 0x9E3779B9
  local k0,k1,k2,k3 = k[1],k[2],k[3],k[4]
  for _ = 1, 8 do
    sum = (sum + delta) % 4294967296
    v0 = (v0 + (((v1*16+k0) % 4294967296) + (v1+sum) + (math.floor(v1/32)+k1))) % 4294967296
    v1 = (v1 + (((v0*16+k2) % 4294967296) + (v0+sum) + (math.floor(v0/32)+k3))) % 4294967296
  end
  return v0, v1
end
local a,b = tea(1,2,{1,2,3,4})
print(a % 100000, b % 100000)

