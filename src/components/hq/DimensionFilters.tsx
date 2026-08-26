'use client';

import { spacing } from '../../tokens';
import { SearchableMultiSelect } from './SearchableMultiSelect';

interface DimensionFiltersProps {
  agencies?:         string[];
  studios:           string[];
  countries:         string[];
  states:            string[];
  cities:            string[];
  selectedAgencies?: string[];
  selectedStudios:   string[];
  selectedCountries: string[];
  selectedStates:    string[];
  selectedCities:    string[];
  onChange: (key: 'agencyNames' | 'studioNames' | 'countries' | 'states' | 'cities', values: string[]) => void;
  showAgency?: boolean;
}

export function DimensionFilters({
  agencies = [], studios, countries, states, cities,
  selectedAgencies = [], selectedStudios, selectedCountries, selectedStates, selectedCities,
  onChange,
  showAgency = true,
}: DimensionFiltersProps) {
  const fields = [
    { label: 'Agency',  key: 'agencyNames' as const, options: agencies,  value: selectedAgencies  },
    { label: 'Studio',  key: 'studioNames' as const, options: studios,   value: selectedStudios   },
    { label: 'Country', key: 'countries'   as const, options: countries, value: selectedCountries },
    { label: 'State',   key: 'states'      as const, options: states,    value: selectedStates    },
    { label: 'City',    key: 'cities'      as const, options: cities,    value: selectedCities    },
  ].filter(f => showAgency || f.key !== 'agencyNames');

  return (
    <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
      {fields.map(({ label, key, options, value }) => (
        <SearchableMultiSelect
          key={key}
          label={label}
          options={options}
          value={value}
          onChange={vals => onChange(key, vals)}
        />
      ))}
    </div>
  );
}
