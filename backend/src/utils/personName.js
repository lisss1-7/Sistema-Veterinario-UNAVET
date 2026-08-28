const { isValidName } = require('./inputValidation');

const cleanNamePart = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
};

const buildFullName = ({
  firstName,
  middleName,
  firstSurname,
  secondSurname,
}) =>
  [firstName, middleName, firstSurname, secondSurname]
    .map(cleanNamePart)
    .filter(Boolean)
    .join(' ');

const getTutorNameParts = (data = {}) => ({
  firstName: cleanNamePart(data.tutorFirstName),
  middleName: cleanNamePart(data.tutorMiddleName),
  firstSurname: cleanNamePart(data.tutorFirstSurname),
  secondSurname: cleanNamePart(data.tutorSecondSurname),
});

const getUserNameParts = (data = {}) => ({
  firstName: cleanNamePart(data.firstName),
  middleName: cleanNamePart(data.middleName),
  firstSurname: cleanNamePart(data.firstSurname),
  secondSurname: cleanNamePart(data.secondSurname),
});

const areValidNameParts = (
  parts,
  { requireFirstSurname = true } = {}
) => {
  if (!parts.firstName || (requireFirstSurname && !parts.firstSurname)) {
    return false;
  }

  return Object.values(parts).every(
    (part) => !part || isValidName(part)
  );
};

module.exports = {
  areValidNameParts,
  buildFullName,
  cleanNamePart,
  getTutorNameParts,
  getUserNameParts,
};
