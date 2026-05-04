import { apiClient } from '../lib/axios';
import { SOSAlert, EmergencyContact, SOSTriggerRequest } from '@speedygo/types';

export const sosService = {
  trigger: (data: SOSTriggerRequest) =>
    apiClient.post<SOSAlert>('/sos/trigger', data).then(r => r.data),

  getContacts: () =>
    apiClient.get<EmergencyContact[]>('/sos/contacts').then(r => r.data),

  setContacts: (contacts: EmergencyContact[]) =>
    apiClient.post<EmergencyContact[]>('/sos/contacts', contacts).then(r => r.data),
};

