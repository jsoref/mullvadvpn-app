import AccountDataCache, { AccountFetchRetryAction } from '../src/main/account-data-cache';
import { IAccountData } from '../src/shared/daemon-rpc-types';
import sinon from 'sinon';
import { expect, spy } from 'chai';

describe('IAccountData cache', () => {
  const dummyAccountToken = '9876543210';
  const dummyAccountData: IAccountData = {
    expiry: new Date('2038-01-01').toISOString(),
  };

  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    clock.restore();
  });

  it('should notify when fetch succeeds on the first attempt', async () => {
    const cache = new AccountDataCache(
      (_token) => Promise.resolve(dummyAccountData),
      (_data) => {},
    );

    const watcher = new Promise((resolve, reject) => {
      cache.fetch(dummyAccountToken, {
        onFinish: () => resolve(),
        onError: (_error: Error) => {
          reject();
          return AccountFetchRetryAction.stop;
        },
      });
    });

    return expect(watcher).to.eventually.be.fulfilled;
  });

  it('should notify when fetch fails on the first attempt', async () => {
    const cache = new AccountDataCache(
      (_token) => Promise.reject(new Error('Fetch fail')),
      (_data) => {},
    );

    const watcher = new Promise((resolve, reject) => {
      cache.fetch(dummyAccountToken, {
        onFinish: (_reason?: any) => resolve(),
        onError: (_error: Error) => {
          reject();
          return AccountFetchRetryAction.stop;
        },
      });
    });

    return expect(watcher).to.eventually.be.rejected;
  });

  it('should update when fetch succeeds on the first attempt', async () => {
    const update = new Promise((resolve, reject) => {
      const cache = new AccountDataCache(
        (_) => Promise.resolve(dummyAccountData),
        () => resolve(),
      );

      cache.fetch(dummyAccountToken, {
        onFinish: () => {},
        onError: (_error: Error) => {
          reject();
          return AccountFetchRetryAction.stop;
        },
      });
    });

    return expect(update).to.eventually.be.fulfilled;
  });

  it('should update when fetch succeeds on the second attempt', async () => {
    const update = new Promise((resolve, reject) => {
      let firstAttempt = true;
      const fetch = () => {
        if (firstAttempt) {
          firstAttempt = false;
          setTimeout(() => clock.tick(9000), 0);
          return Promise.reject(new Error('First attempt fails'));
        } else {
          resolve();
          return Promise.resolve(dummyAccountData);
        }
      };

      const cache = new AccountDataCache(fetch, () => resolve());

      cache.fetch(dummyAccountToken, {
        onFinish: () => reject(),
        onError: (_error: Error) => AccountFetchRetryAction.retry,
      });
    });

    return expect(update).to.eventually.be.fulfilled;
  });

  it('should not retry if told to stop', async () => {
    const update = new Promise((resolve, reject) => {
      let firstAttempt = true;
      const fetch = () => {
        if (firstAttempt) {
          firstAttempt = false;
          setTimeout(() => clock.tick(14000), 0);
          return Promise.reject(new Error('First attempt fails'));
        } else {
          reject();
          return Promise.resolve(dummyAccountData);
        }
      };

      const cache = new AccountDataCache(fetch, () => resolve());

      setTimeout(resolve, 12000);

      cache.fetch(dummyAccountToken, {
        onFinish: () => {},
        onError: (_error: Error) => AccountFetchRetryAction.stop,
      });
    });

    return expect(update).to.eventually.be.fulfilled;
  });

  it('should cancel first fetch', async () => {
    const firstError = spy((_error: Error) => AccountFetchRetryAction.stop);
    const secondSuccess = spy();

    const update = new Promise<IAccountData>((resolve, reject) => {
      let firstAttempt = true;
      const fetch = (_token: string) => {
        if (firstAttempt) {
          firstAttempt = false;

          cache.fetch('1231231231', {
            onFinish: secondSuccess,
            onError: () => {
              reject();
              return AccountFetchRetryAction.stop;
            },
          });

          return new Promise<IAccountData>((resolve) => {
            setTimeout(() => resolve(dummyAccountData), 1000);
          });
        } else {
          reject();
          return Promise.resolve(dummyAccountData);
        }
      };

      const cache = new AccountDataCache(fetch, (_accountData?: IAccountData) => {
        resolve();
      });

      setTimeout(resolve, 12000);

      cache.fetch(dummyAccountToken, {
        onFinish: reject,
        onError: firstError,
      });
    });

    return expect(update).to.eventually.be.fulfilled.then(() => {
      expect(firstError).to.have.been.called.once;
      expect(secondSuccess).to.have.been.called.once;
      return;
    });
  });

  it('should refetch if account has expired', async () => {
    const expiredSpy = spy();
    const nonExpiredSpy = spy();

    const update = new Promise((resolve, reject) => {
      let firstAttempt = true;
      const fetch = () => {
        if (firstAttempt) {
          expiredSpy();
          firstAttempt = false;
          setTimeout(() => clock.tick(60_000), 0);
          return Promise.resolve({
            expiry: new Date('1969-01-01').toISOString(),
          });
        } else {
          nonExpiredSpy();
          resolve();
          return Promise.resolve(dummyAccountData);
        }
      };

      const cache = new AccountDataCache(fetch, () => {});

      cache.fetch(dummyAccountToken, {
        onFinish: () => {},
        onError: (_error: Error) => {
          reject();
          return AccountFetchRetryAction.stop;
        },
      });
    });

    return expect(update).to.eventually.be.fulfilled.then(() => {
      expect(expiredSpy).to.have.been.called.once;
      expect(nonExpiredSpy).to.have.been.called.once;
    });
  });

  it('should clear scheduled retry if another fetch is performed', async () => {
    const firstError = spy();
    const secondSuccess = spy();
    const updateHandler = spy();

    const update = new Promise((resolve, reject) => {
      let attempts = 0;
      const fetch = () => {
        attempts++;
        if (attempts === 1) {
          return Promise.reject(new Error('First attempt fails'));
        } else if (attempts === 2) {
          setTimeout(() => clock.tick(8000));
          return Promise.resolve(dummyAccountData);
        } else {
          reject();
          return Promise.resolve(dummyAccountData);
        }
      };

      const cache = new AccountDataCache(fetch, updateHandler);

      cache.fetch(dummyAccountToken, {
        onFinish: () => {},
        onError: (_error: Error) => {
          firstError();
          return AccountFetchRetryAction.retry;
        },
      });
      setTimeout(() => {
        cache.fetch(dummyAccountToken, {
          onFinish: () => {
            secondSuccess();
            setTimeout(resolve);
          },
          onError: (_error: Error) => AccountFetchRetryAction.stop,
        });
      });
    });

    return expect(update).to.eventually.be.fulfilled.then(() => {
      expect(firstError).to.have.been.called.once;
      expect(secondSuccess).to.have.been.called.once;
      expect(updateHandler).to.have.been.called.twice;
    });
  });

  it('should not perform a fetch if called twice synchronously', async () => {
    const fetchSpy = spy();
    const update = new Promise((resolve, _reject) => {
      const fetch = () => {
        fetchSpy();
        return Promise.resolve(dummyAccountData);
      };

      const cache = new AccountDataCache(fetch, () => {});
      const onError = (_error: Error) => AccountFetchRetryAction.stop;
      cache.fetch(dummyAccountToken, { onFinish: () => {}, onError });
      cache.fetch(dummyAccountToken, { onFinish: () => resolve(), onError });
    });

    return expect(update).to.eventually.be.fulfilled.then(() => {
      expect(fetchSpy).to.have.been.called.once;
    });
  });
});
