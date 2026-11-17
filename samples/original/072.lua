-- MoonSec V3 sample 072
-- Markov chain next-char frequencies
local text = "ababacabadaba"
local freq = {}
for i = 1, #text-1 do
  local a, b = text:sub(i,i), text:sub(i+1,i+1)
  freq[a] = freq[a] or {}
  freq[a][b] = (freq[a][b] or 0) + 1
end
local h = 0
for a, row in pairs(freq) do
  for b, c in pairs(row) do
    h = h + a:byte() * 131 + b:byte() * c
  end
end
print(h)

