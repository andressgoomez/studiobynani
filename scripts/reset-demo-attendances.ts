import { PrismaClient } from '@prisma/client';
import { calculateAttendanceAmounts } from '../packages/domain/src/index.js';

const prisma = new PrismaClient();

const demoClients = [
  'Mariana González', 'Sofía Rodríguez', 'Camila Fernández', 'Valentina López',
  'Lucía Martínez', 'Julieta Romero', 'Paula Sánchez', 'Agustina Torres',
  'Carolina Díaz', 'Florencia Acosta', 'Micaela Benítez', 'Daniela Peralta'
];

function argentinaDate(daysAgo: number, hour: number, minute: number) {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000));
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
}

const plans = [
  [
    ['perfilado-cejas', 'lula', 'cash'], ['lash-lifting', 'lola', 'transfer'], ['perfilado-cejas', 'nani', 'transfer'],
    ['lash-lifting', 'lula', 'cash'], ['perfilado-cejas', 'lola', 'cash'], ['limpieza-extracciones', 'ledis', 'cash'],
    ['perfilado-cejas', 'nani', 'cash'], ['lash-lifting', 'lula', 'transfer'], ['perfilado-cejas', 'lola', 'transfer'],
    ['lash-lifting', 'nani', 'cash'], ['perfilado-cejas', 'lula', 'cash'], ['perfilado-cejas', 'lola', 'cash']
  ],
  [
    ['lash-lifting', 'lula', 'transfer'], ['perfilado-cejas', 'lola', 'cash'], ['perfilado-cejas', 'nani', 'transfer'],
    ['limpieza-extracciones', 'ledis', 'cash'], ['lash-lifting', 'lula', 'cash'], ['perfilado-cejas', 'lola', 'transfer'],
    ['perfilado-cejas', 'nani', 'cash'], ['lash-lifting', 'lula', 'cash'], ['perfilado-cejas', 'lola', 'cash'],
    ['perfilado-cejas', 'nani', 'transfer'], ['lash-lifting', 'lula', 'transfer'], ['perfilado-cejas', 'lola', 'cash']
  ],
  [
    ['perfilado-cejas', 'lula', 'cash'], ['lash-lifting', 'lola', 'transfer'], ['limpieza-extracciones', 'ledis', 'cash'],
    ['perfilado-cejas', 'nani', 'cash'], ['lash-lifting', 'lula', 'cash'], ['perfilado-cejas', 'lola', 'transfer'],
    ['perfilado-cejas', 'nani', 'transfer'], ['lash-lifting', 'lula', 'cash'], ['perfilado-cejas', 'lola', 'cash'],
    ['perfilado-cejas', 'nani', 'cash'], ['lash-lifting', 'lula', 'transfer'], ['perfilado-cejas', 'lola', 'cash']
  ]
] as const;

async function main() {
  const services = await prisma.service.findMany();
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  await prisma.attendance.deleteMany();

  let clientIndex = 0;
  for (let day = 0; day < plans.length; day += 1) {
    for (let index = 0; index < plans[day].length; index += 1) {
      const [serviceId, employeeId, paymentMethod] = plans[day][index];
      const service = serviceMap.get(serviceId);
      if (!service) throw new Error(`Servicio no encontrado: ${serviceId}`);
      const status = day === 0 && index === 11 ? 'cancelled' : 'performed';
      const amounts = calculateAttendanceAmounts(employeeId, service, paymentMethod, status);
      const createdAt = argentinaDate(day, 9 + Math.floor(index / 2), index % 2 === 0 ? 0 : 30);
      await prisma.attendance.create({
        data: {
          id: `demo-${day + 1}-${index + 1}`,
          employeeId,
          clientName: demoClients[clientIndex % demoClients.length],
          serviceId,
          paymentMethod,
          status,
          ...amounts,
          createdAt,
          updatedAt: createdAt
        }
      });
      clientIndex += 1;
    }
  }
  console.log(`Se cargaron ${plans.flat().length} atenciones demo en los últimos 3 días.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
