import {Application, BindingScope, Provider} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {expect} from '@loopback/testlab';
import {PrismaClient} from '@prisma/client';
import assert from 'assert';
import {PrismaBindings, PrismaComponent} from '../../';

describe('Prisma Component', () => {
  let app: Application;

  beforeEach(() => {
    app = new (class extends RepositoryMixin(Application) {})();
  });

  describe('datasource lifecycle initialization', () => {
    it('creates new locked singleton Prisma Client instance', async () => {
      app.component(PrismaComponent);
      await app.init();
      expect(
        app.getSync(PrismaBindings.PRISMA_CLIENT_INSTANCE),
      ).to.be.instanceOf(PrismaClient);
      assert(app.getBinding(PrismaBindings.PRISMA_CLIENT_INSTANCE).isLocked);
    });

    it('does not override existing singleton Prisma Client instance', async () => {
      app
        .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
        .to(new PrismaClient())
        .inScope(BindingScope.SINGLETON);
      const expectedPrismaClientInstance = app.getSync(
        PrismaBindings.PRISMA_CLIENT_INSTANCE,
      );
      app.component(PrismaComponent);
      await app.init();
      expect(app.getSync(PrismaBindings.PRISMA_CLIENT_INSTANCE)).to.equal(
        expectedPrismaClientInstance,
      );
    });

    it('reuses Prisma Client instance when initialized more than once', () => {
      const component = new PrismaComponent(app);
      component.init();
      const prismaClient1 = app.getSync(PrismaBindings.PRISMA_CLIENT_INSTANCE);
      component.init();
      const prismaClient2 = app.getSync(PrismaBindings.PRISMA_CLIENT_INSTANCE);
      assert(prismaClient1 === prismaClient2);
    });

    it('locks existing singleton Prisma Client instance', async () => {
      app
        .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
        .to(new PrismaClient())
        .inScope(BindingScope.SINGLETON);
      app.component(PrismaComponent);
      await app.init();
      assert(app.getBinding(PrismaBindings.PRISMA_CLIENT_INSTANCE).isLocked);
    });

    it('binds and locks Prisma Client model', async () => {
      const prismaClient = new PrismaClient();
      app
        .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
        .to(prismaClient)
        .inScope(BindingScope.SINGLETON);
      app.component(PrismaComponent);
      await app.init();
      const modelBindings = app.find(
        `${PrismaBindings.PRISMA_MODEL_NAMESPACE}.*`,
      );
      assert(app.getSync(modelBindings[0].key) === prismaClient.user);
    });

    describe('Bound Prisma Client instance acceptable binding type', () => {
      it('rejects Prisma Client instance bound as alias', async () => {
        const customPrismaClientBindingKey = 'customPrismaClientBindingKey';
        const prismaClient = new PrismaClient();
        app
          .bind(customPrismaClientBindingKey)
          .to(prismaClient)
          .inScope(BindingScope.SINGLETON);

        app
          .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
          .toAlias(customPrismaClientBindingKey)
          .inScope(BindingScope.SINGLETON);
        app.component(PrismaComponent);
        expect(app.init).to.throw();
      });

      it('rejects Prisma Client instance bound as dynamic value', async () => {
        const prismaClient = new PrismaClient();
        app
          .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
          .toDynamicValue(() => prismaClient)
          .inScope(BindingScope.SINGLETON);
        app.component(PrismaComponent);
        expect(app.init).to.throw();
      });

      it('rejects Prisma Client instance bound as provider', async () => {
        class PrismaProvider implements Provider<PrismaClient> {
          private static _prismaClient = new PrismaClient();
          value() {
            return PrismaProvider._prismaClient;
          }
        }
        app
          .bind(PrismaBindings.PRISMA_CLIENT_INSTANCE)
          .toProvider(PrismaProvider)
          .inScope(BindingScope.SINGLETON);
        app.component(PrismaComponent);
        expect(app.init).to.throw();
      });
    });
  });
});
