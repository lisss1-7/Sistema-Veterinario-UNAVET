import {
  Children,
  Fragment,
  isValidElement,
  type ChangeEvent,
  type OptionHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';

type ThemedSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

type SelectOption = {
  disabled: boolean;
  key: string;
  label: ReactNode;
  value: string;
};

const EMPTY_VALUE = '__unavet_empty_select_value__';

const optionValue = (value: string) => (value === '' ? EMPTY_VALUE : value);

const getText = (node: ReactNode): string => {
  let text = '';

  Children.forEach(node, (child) => {
    if (typeof child === 'string' || typeof child === 'number') {
      text += String(child);
    } else if (isValidElement<{ children?: ReactNode }>(child)) {
      text += getText(child.props.children);
    }
  });

  return text;
};

const getOptions = (children: ReactNode): SelectOption[] => {
  const options: SelectOption[] = [];

  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;

      if (child.type === Fragment) {
        visit((child.props as { children?: ReactNode }).children);
        return;
      }

      if (child.type !== 'option') return;

      const option = child as ReactElement<
        OptionHTMLAttributes<HTMLOptionElement>
      >;
      const label = option.props.children;
      const value =
        option.props.value === undefined
          ? getText(label)
          : String(option.props.value);

      options.push({
        disabled: Boolean(option.props.disabled),
        key: String(option.key ?? `${value}-${options.length}`),
        label,
        value,
      });
    });
  };

  visit(children);
  return options;
};

export default function ThemedSelect({
  children,
  className = '',
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
  title,
  autoFocus,
  tabIndex,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
}: ThemedSelectProps) {
  const options = getOptions(children);
  const controlledValue =
    value === undefined ? undefined : optionValue(String(value));
  const initialValue =
    defaultValue === undefined ? undefined : optionValue(String(defaultValue));

  const handleValueChange = (nextValue: string) => {
    const nextNativeValue = nextValue === EMPTY_VALUE ? '' : nextValue;
    const target = { value: nextNativeValue } as HTMLSelectElement;

    onChange?.({
      target,
      currentTarget: target,
    } as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <SelectPrimitive.Root
      value={controlledValue}
      defaultValue={initialValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={id}
        title={title}
        autoFocus={autoFocus}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        className={`themed-select-trigger inline-flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className="themed-select-content z-[100] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
          style={{
            minWidth: 'var(--radix-select-trigger-width)',
            maxHeight: 'var(--radix-select-content-available-height)',
          }}
        >
          <SelectPrimitive.ScrollUpButton className="flex h-7 items-center justify-center bg-popover text-primary">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>

          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.key}
                value={optionValue(option.value)}
                disabled={option.disabled}
                className="themed-select-option relative flex w-full cursor-default select-none items-center rounded-md py-2 pl-3 pr-9 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
                  <Check className="h-4 w-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>

          <SelectPrimitive.ScrollDownButton className="flex h-7 items-center justify-center bg-popover text-primary">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
