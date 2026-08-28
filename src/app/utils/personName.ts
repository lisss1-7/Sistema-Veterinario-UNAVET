export type PersonNameParts = {
  firstName?: string;
  middleName?: string;
  firstSurname?: string;
  secondSurname?: string;
};

export const buildFullName = ({
  firstName,
  middleName,
  firstSurname,
  secondSurname,
}: PersonNameParts) =>
  [firstName, middleName, firstSurname, secondSurname]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');

export const hasValidRequiredNameParts = ({
  firstName,
  firstSurname,
}: PersonNameParts) =>
  Boolean(firstName?.trim() && firstSurname?.trim());
