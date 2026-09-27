
                <textarea
                  value={reportDetails}
                  onChange={(event) =>
                    setReportDetails(
                      event.target.value.slice(
                        0,
                        1000
                      )
                    )
                  }
                  disabled={reportLoading}
                  rows={4}
                  placeholder="Tell us what happened."
                  className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-black disabled:opacity-50"
                />

                <p className="mt-1 text-right text-xs text-gray-400">
                  {reportDetails.length}/1000
                </p>

                {reportError && (
                  <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                    {reportError}
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 gap-3">

                  <button
                    type="button"
                    onClick={closeReportMessage}
                    disabled={reportLoading}
                    className="rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={handleReportMessage}
                    disabled={
                      reportLoading ||
                      !reportReason
                    }
                    className="rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {reportLoading
                      ? 'Submitting...'
                      : 'Submit report'}
                  </button>

                </div>

              </>

            )}

          </div>

        </div>

      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 w-full max-w-full border-t border-gray-200 bg-white/95 backdrop-blur">

        <form
          onSubmit={sendMessage}
          className="mx-auto flex w-full min-w-0 max-w-3xl items-end gap-3 px-5 py-4 sm:px-6"
        >

          <input
            type="text"
            value={newMessage}
            onChange={(event) =>
              setNewMessage(
                event.target.value
              )
            }
            placeholder={`Message ${firstName}...`}
            disabled={sending}
            className="min-w-0 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
          />

          <button
            type="submit"
            disabled={
              sending ||
              !newMessage.trim()
            }
            className="shrink-0 rounded-2xl bg-black px-5 py-3 text-sm font-bold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending
              ? 'Sending...'
              : 'Send'}
          </button>

        </form>

      </div>

    </main>
  )
}
