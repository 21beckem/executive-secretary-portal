import { AuthGate } from './api/AuthGate.js';
import { ApiClient } from './api/ApiClient.js';
import { AppointmentRepository } from './repositories/AppointmentRepository.js';
import { AppointmentTypeRepository } from './repositories/AppointmentTypeRepository.js';
import { AvailabilityRepository } from './repositories/AvailabilityRepository.js';
import { PortalApp } from './components/PortalApp.js';

async function bootstrap() {
  const rootElement = document.getElementById('app');

  const authGate = new AuthGate();
  await authGate.ensureAuthenticated(rootElement);

  const apiClient = new ApiClient({
    baseUrl: 'https://executive-secretary-portal.m1-g2-becker3.workers.dev/api',
    getPassword: () => authGate.password,
  });

  const appointmentRepository = new AppointmentRepository(apiClient);
  const appointmentTypeRepository = new AppointmentTypeRepository(apiClient);
  const availabilityRepository = new AvailabilityRepository(apiClient);

  const portal = new PortalApp({
    apiClient,
    authGate,
    appointmentRepository,
    appointmentTypeRepository,
    availabilityRepository,
    rootElement,
  });

  await portal.init();
}

bootstrap();