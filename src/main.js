import { AuthGate } from './api/AuthGate.js';
import { DummyApiClient } from './api/DummyApiClient.js';
import { AppointmentRepository } from './repositories/AppointmentRepository.js';
import { AppointmentTypeRepository } from './repositories/AppointmentTypeRepository.js';
import { AvailabilityRepository } from './repositories/AvailabilityRepository.js';
import { App } from './components/App.js';

async function bootstrap() {
  const rootElement = document.getElementById('app');

  const authGate = new AuthGate();
  await authGate.ensureAuthenticated(rootElement);

  // --- Swap point for going live ---
  // Once the Cloudflare Worker is deployed, replace DummyApiClient with:
  //
  //   import { ApiClient } from './api/ApiClient.js';
  //   const apiClient = new ApiClient({
  //     baseUrl: 'https://your-worker.your-subdomain.workers.dev/api',
  //     getPassword: () => authGate.password,
  //   });
  //
  // Every repository, component, and model above this line is already
  // written against the same interface, so nothing else needs to change.
  const apiClient = new DummyApiClient({ getPassword: () => authGate.password });

  const appointmentRepository = new AppointmentRepository(apiClient);
  const appointmentTypeRepository = new AppointmentTypeRepository(apiClient);
  const availabilityRepository = new AvailabilityRepository(apiClient);

  const app = new App({
    appointmentRepository,
    appointmentTypeRepository,
    availabilityRepository,
    authGate,
    rootElement,
  });

  await app.init();
}

bootstrap();
