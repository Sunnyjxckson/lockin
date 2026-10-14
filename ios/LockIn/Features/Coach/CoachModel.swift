import SwiftUI
import LockInKit

/// The chat's state: the thread, whether the coach is writing, and what went wrong.
@Observable
@MainActor
final class CoachChatModel {
    var messages: [CoachMessage] = []
    var loading = true
    var loadError: String? = nil
    var thinking = false
    var sendError: String? = nil
    var voice: CoachVoice = .stoic
    /// Check-ins that were unread when the chat opened. They carry a small dot until the chat is closed.
    var fresh: Set<String> = []
    /// Goes up each time a reply lands.
    var replyTick = 0
    var today: DateStr = LIDate.todayNY()

    func load(_ store: AppStore) async {
        loadError = nil
        today = LIDate.todayNY()
        do {
            var rows = try await store.loadCoachMessages()
            voice = await store.coachSettings().voice
            messages = rows
            noteFresh(rows)
            loading = false
            // The check-ins that are due now: after the workout, after a slip, after yesterday's misses.
            let sent = (try? await store.syncCoachCheckins()) ?? 0
            if sent > 0 {
                rows = try await store.loadCoachMessages()
                messages = rows
                noteFresh(rows)
            }
            let unread = rows.filter { !$0.read }.map { $0.id }
            if !unread.isEmpty { await store.markCoachRead(unread) }
        } catch {
            loading = false
            if messages.isEmpty {
                loadError = (error as? APIError)?.errorDescription ?? "Could not load the chat."
            }
        }
    }

    private func noteFresh(_ rows: [CoachMessage]) {
        for m in rows where !m.read && m.sender == .coach { fresh.insert(m.id) }
    }

    /// Save their message, then ask for the answer. False when it could not be saved, so the text stays in the field.
    func send(_ store: AppStore, text: String) async -> Bool {
        if thinking { return false }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }
        do {
            let saved = try await store.saveCoachUserMessage(trimmed)
            withAnimation(.easeOut(duration: 0.2)) { messages.append(saved) }
        } catch {
            sendError = (error as? APIError)?.errorDescription ?? "Could not send that."
            LIHaptics.error()
            return false
        }
        await reply(store)
        return true
    }

    func reply(_ store: AppStore) async {
        sendError = nil
        thinking = true
        do {
            let made = try await store.requestCoachReply(history: messages)
            thinking = false
            withAnimation(.easeOut(duration: 0.25)) { messages.append(made) }
            replyTick += 1
            LIHaptics.check()
        } catch {
            thinking = false
            if let api = error as? APIError, api.isOffline {
                sendError = "Could not reach the coach. Check your connection."
            } else {
                sendError = (error as? LocalizedError)?.errorDescription ?? "The coach could not answer."
            }
            LIHaptics.error()
        }
    }
}
