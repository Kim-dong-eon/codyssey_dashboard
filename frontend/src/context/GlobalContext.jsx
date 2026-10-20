import { createContext } from 'react';

export const GlobalContext = createContext({
  selectedCohort: null,
  setSelectedCohort: () => {}
});
