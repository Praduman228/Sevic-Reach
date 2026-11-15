import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ANY, type Firm } from "@/lib/crm";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; count: number };

/** Searchable filter dropdown — used for state / city, where the list is long. */
export function FilterCombobox({
  value,
  onChange,
  options,
  allLabel,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  allLabel: string;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={allLabel}
          className={cn("justify-between font-normal", className ?? "w-full sm:w-48")}
        >
          <span className="truncate">{current ? `${current.label} (${current.count})` : allLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-72 overflow-y-auto">
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => { onChange(ANY); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === ANY ? "opacity-100" : "opacity-0")} />
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.id}
                  value={`${o.label} ${o.id}`}
                  onSelect={() => { onChange(o.id); setOpen(false); }}
                  className="justify-between gap-3"
                >
                  <span className="flex min-w-0 items-center">
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", value === o.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{o.label}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{o.count}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const byState = (f: Firm) => f.state;
export const byCity = (f: Firm) => f.city;
