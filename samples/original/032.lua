-- MoonSec V3 sample 032
-- Brainfuck-lite interpreter
local src = "++[>++[>+++<-]<-]>>."
local tape, ptr, pc, out = {}, 1, 1, 0
for i = 1, 32 do tape[i] = 0 end
local match, st = {}, {}
for i = 1, #src do
  local c = src:sub(i,i)
  if c == "[" then st[#st+1] = i
  elseif c == "]" then local j = st[#st]; st[#st]=nil; match[i]=j; match[j]=i end
end
while pc <= #src do
  local c = src:sub(pc,pc)
  if c == ">" then ptr = ptr + 1
  elseif c == "<" then ptr = ptr - 1
  elseif c == "+" then tape[ptr] = (tape[ptr] + 1) % 256
  elseif c == "-" then tape[ptr] = (tape[ptr] - 1) % 256
  elseif c == "." then out = out + tape[ptr]
  elseif c == "[" then if tape[ptr] == 0 then pc = match[pc] end
  elseif c == "]" then if tape[ptr] ~= 0 then pc = match[pc] end
  end
  pc = pc + 1
end
print(out, tape[ptr])

