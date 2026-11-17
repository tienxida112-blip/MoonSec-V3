-- MoonSec V3 sample 047
-- FNV-1a 32-bit
local h = 2166136261
local s = "moonsec-v3-fnv-bench"
for i = 1, #s do
  h = (h + s:byte(i)) % 4294967296
  h = (h * 16777619) % 4294967296
end
print(h)

