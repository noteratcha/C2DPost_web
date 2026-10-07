/** Manual page for the signed-in user type (admin sees the index of all manuals). */
export function getManualUrl(person, isAdmin = false) {
  const status = (person?.Status || '').toUpperCase();
  if (isAdmin || status === 'ADMIN') return '/manuals/index.html';
  if (status === 'POSTOFFICE') return '/manuals/postoffice.html';
  return '/manuals/agency.html';
}
