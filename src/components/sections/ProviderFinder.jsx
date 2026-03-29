import { useState } from 'react';
import { Search, User, Building2, Phone, MapPin, Plus, Loader2, Check } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { SectionTitle } from '../ui/FormWrap';
import { C } from '../../constants/colors';
import { searchProviders, searchPharmacies, COMMON_SPECIALTIES } from '../../services/npi';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

export default function ProviderFinder({ addItem, updateSettings, data }) {
  const [searchType, setSearchType] = useState('provider');
  const [form, setForm] = useState({ name: '', specialty: '', city: '', state: '', zip: '' });
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searched, setSearched] = useState(false);
  const [saved, setSaved] = useState({});

  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const hasInput = form.name || form.specialty || form.city || form.state || form.zip;

  const doSearch = async () => {
    if (!hasInput) return;
    setLoading(true); setError(null); setSearched(true);
    try {
      const res = searchType === 'provider'
        ? await searchProviders(form)
        : await searchPharmacies({ name: form.name, city: form.city, state: form.state, zip: form.zip });
      setResults(res);
    } catch (e) {
      setError(e.message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const saveAsProvider = async (r) => {
    await addItem('providers', {
      name: r.name,
      specialty: r.specialty,
      clinic: r.address ? `${r.address}, ${r.city}, ${r.state} ${r.zip}` : '',
      phone: r.phone,
      fax: r.fax || '',
      notes: `NPI: ${r.npi}`,
    });
    setSaved(s => ({ ...s, [r.npi]: true }));
  };

  const saveAsPharmacy = async (r) => {
    const pharmName = r.name + (r.city ? ` (${r.city}, ${r.state})` : '');
    await updateSettings({ pharmacy: pharmName });
    setSaved(s => ({ ...s, [r.npi]: true }));
  };

  return (
    <div className="mt-2">
      <SectionTitle>Find Provider</SectionTitle>

      {/* Search type toggle */}
      <div className="flex gap-1.5 mb-3.5">
        {[['provider', 'Doctors', User], ['pharmacy', 'Pharmacies', Building2]].map(([type, label, Icon]) => (
          <button key={type} onClick={() => { setSearchType(type); setResults([]); setSearched(false); }}
            className={`flex items-center gap-1.5 py-1.5 px-4 rounded-full text-xs font-medium border cursor-pointer font-montserrat ${
              searchType === type ? 'border-salve-sage bg-salve-sage/15 text-salve-sage' : 'border-salve-border bg-transparent text-salve-textFaint'
            }`}
          ><Icon size={13} />{label}</button>
        ))}
      </div>

      {/* Search form */}
      <Card>
        <Field label="Name" value={form.name} onChange={v => sf('name', v)}
          placeholder={searchType === 'provider' ? 'Last name or full name' : 'Pharmacy name'} />
        {searchType === 'provider' && (
          <Field label="Specialty" value={form.specialty} onChange={v => sf('specialty', v)}
            options={COMMON_SPECIALTIES} />
        )}
        <div className="grid grid-cols-3 gap-2">
          <Field label="City" value={form.city} onChange={v => sf('city', v)} placeholder="City" />
          <Field label="State" value={form.state} onChange={v => sf('state', v)} options={US_STATES} />
          <Field label="Zip" value={form.zip} onChange={v => sf('zip', v)} placeholder="Zip" />
        </div>
        <Button onClick={doSearch} disabled={!hasInput || loading} className="w-full justify-center">
          {loading ? <><Loader2 size={14} className="animate-spin" /> Searching...</> : <><Search size={14} /> Search NPI Registry</>}
        </Button>
      </Card>

      {/* Error */}
      {error && (
        <div className="text-sm text-salve-rose py-3 text-center">
          {error}
        </div>
      )}

      {/* Results */}
      {searched && !loading && !error && results.length === 0 && (
        <div className="text-sm text-salve-textFaint text-center py-6">No results found. Try broadening your search.</div>
      )}

      {results.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] text-salve-textFaint font-semibold uppercase tracking-widest mb-2">
            {results.length} result{results.length !== 1 ? 's' : ''}
          </div>
          {results.map(r => (
            <Card key={r.npi}>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-salve-text mb-0.5 truncate">
                    {r.name}{r.credential ? <span className="text-salve-textFaint font-normal">, {r.credential}</span> : ''}
                  </div>
                  {r.specialty && (
                    <div className="mb-1">
                      <Badge label={r.specialty} color={C.lav} bg="rgba(184,169,232,0.15)" />
                    </div>
                  )}
                  {r.address && (
                    <div className="text-xs text-salve-textMid flex items-start gap-1 mb-0.5">
                      <MapPin size={12} className="mt-0.5 flex-shrink-0 text-salve-textFaint" />
                      <span>{r.address}{r.address2 ? `, ${r.address2}` : ''}, {r.city}, {r.state} {r.zip}</span>
                    </div>
                  )}
                  {r.phone && (
                    <div className="text-xs text-salve-textMid flex items-center gap-1">
                      <Phone size={12} className="text-salve-textFaint" />
                      <a href={`tel:${r.phone}`} className="text-salve-sage no-underline">{formatPhone(r.phone)}</a>
                    </div>
                  )}
                  <div className="text-[10px] text-salve-textFaint mt-1">NPI: {r.npi}</div>
                </div>
                <div className="ml-2 flex-shrink-0">
                  {saved[r.npi] ? (
                    <span className="text-salve-sage text-xs flex items-center gap-1"><Check size={14} /> Saved</span>
                  ) : (
                    <button
                      onClick={() => searchType === 'provider' ? saveAsProvider(r) : saveAsPharmacy(r)}
                      className="bg-transparent border border-salve-sage/40 text-salve-sage rounded-full px-3 py-1.5 text-xs cursor-pointer font-montserrat flex items-center gap-1 hover:bg-salve-sage/10 transition-colors"
                    >
                      <Plus size={12} /> Save
                    </button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!searched && (
        <EmptyState icon={Search} text="Search the national NPI registry for doctors, specialists, and pharmacies" motif="sparkle" />
      )}

      <p className="text-[11px] text-salve-textFaint text-center mt-3 font-montserrat leading-relaxed">
        Data from CMS NPPES NPI Registry. Provider information may not reflect current availability or insurance acceptance.
      </p>
    </div>
  );
}

function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}
