-- MoonSec V3 sample 031
-- Tiny stack VM (postfix)
local code = { "push", 6, "push", 7, "mul", "push", 5, "add", "dup", "push", 2, "div", "sub" }
local st, pc = {}, 1
while pc <= #code do
  local op = code[pc]; pc = pc + 1
  if op == "push" then st[#st+1] = code[pc]; pc = pc + 1
  elseif op == "add" then local b=st[#st]; st[#st]=nil; st[#st]=st[#st]+b
  elseif op == "sub" then local b=st[#st]; st[#st]=nil; st[#st]=st[#st]-b
  elseif op == "mul" then local b=st[#st]; st[#st]=nil; st[#st]=st[#st]*b
  elseif op == "div" then local b=st[#st]; st[#st]=nil; st[#st]=math.floor(st[#st]/b)
  elseif op == "dup" then st[#st+1] = st[#st]
  end
end
print(st[1])

