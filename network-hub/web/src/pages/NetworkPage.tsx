import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import ContactForm from "../components/ContactForm";
import ContactList from "../components/ContactList";
import { useAuth } from "../context/AuthContext";
import type { Contact, ConfigStatus } from "../types";

export default function NetworkPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const { user } = useAuth();

  const load = useCallback(async () => {
    setContacts(await api.contacts.list(query || undefined));
  }, [query]);

  useEffect(() => {
    load().catch(console.error);
    api.config.status().then(setConfig).catch(console.error);
  }, [load]);

  return (
    <>
      <h2 className="page-title">Your network</h2>
      <p className="page-sub">
        Private to <strong>{user?.username}</strong> — contacts you add are not shared with other users.
      </p>

      <div className="grid-2 network-grid">
        <ContactForm onSaved={load} linkedinConfigured={config?.linkedinEnrichment ?? false} username={user?.username ?? ""} />
        <div>
          <div className="field">
            <label htmlFor="search">Search your network</label>
            <input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or company" />
          </div>
          <ContactList contacts={contacts} />
        </div>
      </div>
    </>
  );
}
