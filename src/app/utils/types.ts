export interface Patient {
  id: string;
  petName: string;
  species: string;
  breed: string;
  age: number | string;
  sex: string;
  reproductiveStatus?: string;
  color: string;
  diet?: string;
  tutorFirstName: string;
  tutorMiddleName?: string;
  tutorFirstSurname: string;
  tutorSecondSurname?: string;
  tutorName: string;
  tutorPhone: string;
  tutorEmail: string;
  tutorAddress: string;
  registrationDate: string;
  lastVisit: string;
  photo?: string;
  observations: string;
}

export interface ClinicalRecord {
  id: string;
  patientId: string;
  date: string;
  consultationType: string;
  veterinarianId?: string;
  veterinarian: string;
  reason: string;
  previousSurgeries?: string;
  visibleMasses?: string;
  examSkin?: string;
  examEyes?: string;
  examRespiratory?: string;
  examEars?: string;
  examNervous?: string;
  examGenitourinary?: string;
  examNodules?: string;
  examPressure?: string;
  diagnosis: string;
  treatment: string;
  observations: string;
}

export interface Vaccination {
  id: string;
  patientId: string;
  vaccine: string;
  applicationDate: string;
  veterinarianId?: string;
  veterinarian: string;
  totalDoses: number;
  appliedDoses: number;
  interval: number;
  intervalUnit: 'semanas' | 'meses';
  nextDose: string;
  notes: string;
  status: string;
}

export interface TreatmentService {
  id: string;
  patientId: string;
  type: string;
  category: string;
  name: string;
  diagnosisOrReason: string;
  status: string;
  requestDate: string;
  veterinarianId?: string;
  veterinarian: string;
  observations: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
  resultStatus?: string;
  resultDate?: string;
  result?: string;
}

export interface Appointment {
  id: string;
  tutorFirstName: string;
  tutorMiddleName?: string;
  tutorFirstSurname: string;
  tutorSecondSurname?: string;
  tutorName: string;
  tutorPhone: string;
  petName: string;
  patientId?: string;
  date: string;
  time: string;
  reason: string;
  veterinarian: string;
  status: 'Pendiente' | 'Confirmada' | 'Completada' | 'Cancelada';
}

export interface GroomingAppointment {
  id: string;
  type: 'Grooming en clínica' | 'Grooming con transporte';
  petName: string;
  time: string;
  breed: string;
  animalSize: string;
  age: number | string;
  tutorFirstName: string;
  tutorMiddleName?: string;
  tutorFirstSurname: string;
  tutorSecondSurname?: string;
  tutorName: string;
  tutorPhone: string;
  groomingCost: number;
  transportCost?: number;
  address?: string;
  accessCode?: string;
  status: 'Pendiente' | 'Confirmada' | 'Completada' | 'Cancelada';
  observations?: string;
  patientId?: string;
  date: string;
}

export interface InventoryProduct {
  id: string;
  name: string;
  category: string;
  description: string;
  presentation: string;
  currentStock: number;
  minStock: number;
  price: number;
  expirationDate: string;
  supplier: string;
  status: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  tutorName: string;
  tutorPhone: string;
  date: string;
  veterinarianId?: string;
  veterinarian: string;
  diagnosis: string;
  observations: string;
  medications: PrescriptionMedication[];
}

export interface PrescriptionMedication {
  id: string;
  productId?: string;
  productName: string;
  fromInventory: boolean;
  availableStock?: number;
  quantity: number;
  instructions: string;
  deliveryMode: string;
}

export interface SystemUser {
  id: string;
  firstName: string;
  middleName?: string;
  firstSurname: string;
  secondSurname?: string;
  name: string;
  email: string;
  role: string;
  phone: string;
  specialty?: string;
  status: string;
  creationDate: string;
}
