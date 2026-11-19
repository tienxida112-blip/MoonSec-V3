-- Deterministic stress test: nested control flow, recursion, closures, iterators,
-- tables, varargs, methods, numeric/generic loops, and multiple return values.
local function map(list, fn)
    local out = {}
    for i = 1, #list do
        out[i] = fn(list[i], i)
    end
    return out
end

function mergeSort(values)
    if #values < 2 then
        local copy = {}
        for i = 1, #values do copy[i] = values[i] end
        return copy
    end
    local middle = math.floor(#values / 2)
    local left, right = {}, {}
    for i = 1, middle do left[#left + 1] = values[i] end
    for i = middle + 1, #values do right[#right + 1] = values[i] end
    left = mergeSort(left)
    right = mergeSort(right)
    local result, a, b = {}, 1, 1
    while a <= #left and b <= #right do
        if left[a] <= right[b] then
            result[#result + 1] = left[a]
            a = a + 1
        else
            result[#result + 1] = right[b]
            b = b + 1
        end
    end
    repeat
        if a <= #left then
            result[#result + 1] = left[a]
            a = a + 1
        elseif b <= #right then
            result[#result + 1] = right[b]
            b = b + 1
        else
            break
        end
    until false
    return result
end

function rangeIterator(state, previous)
    local current = previous + 1
    if current <= state.limit then return current, previous + current end
end

local function vectorDot(ax, ay, bx, by)
    return ax * bx + ay * by
end

local source = { 19, 2, 31, 7, 13, 5, 23, 11, 3, 17 }
local sorted = mergeSort(source)
local squares = map(sorted, function(value, index)
    if index % 2 == 0 then return value * value end
    return value + index
end)

local total = 10 + squares[1] + squares[2] + squares[3] + squares[4]
local count = 4
local checksum = 0
for index, value in rangeIterator, { limit = 5 }, 0 do
    checksum = checksum + index * value
end

local dot = vectorDot(3, 4, 6, 8)
local text = ""
for i = 1, #sorted do
    text = text .. (i == 1 and "" or ",") .. tostring(sorted[i])
end

local checks = { total, count, checksum, dot, #text, squares[2] }
local all = true
for i, value in ipairs(checks) do
    if type(value) ~= "number" or value ~= value then all = false end
end
if all and sorted[1] == 2 and sorted[#sorted] == 31 then
    print("stress", total, count, checksum, dot, text)
else
    print("stress-failed", all, sorted[1], sorted[#sorted])
end
