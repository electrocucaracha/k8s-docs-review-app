import unittest
from unittest.mock import patch

from scripts.audit_review_history import finish_connection, records


class ReviewHistoryTests(unittest.TestCase):
    def test_nested_connections_are_exhaustively_paginated(self):
        connection = {"totalCount": 2, "nodes": [{"body": "first"}], "pageInfo": {"hasNextPage": True, "endCursor": "cursor"}}
        with patch("scripts.audit_review_history.graphql", return_value={"node": {"comments": {"nodes": [{"body": "second"}], "pageInfo": {"hasNextPage": False, "endCursor": "last"}}}}) as query:
            finish_connection("thread-id", "PullRequestReviewThread", "comments", "nodes { body } pageInfo { hasNextPage endCursor }", connection)
        self.assertEqual(len(connection["nodes"]), 2)
        self.assertFalse(connection["pageInfo"]["hasNextPage"])
        self.assertEqual(query.call_args.kwargs["cursor"], "cursor")

    def test_incomplete_comment_counts_fail_explicitly(self):
        with self.assertRaisesRegex(RuntimeError, "Incomplete"):
            finish_connection("id", "PullRequest", "reviews", "", {"totalCount": 2, "nodes": [], "pageInfo": {"hasNextPage": False}})

    def test_automation_and_author_replies_are_distinguished(self):
        comments = [{"author": {"login": "k8s-triage-robot", "__typename": "User"}, "body": "Stale"}, {"author": {"login": "contributor", "__typename": "User"}, "body": "Done"}, {"author": {"login": "reviewer", "__typename": "User"}, "body": "Use tú"}]
        history = {"pullRequests": [{"number": 42, "title": "Spanish docs", "author": {"login": "contributor"}, "comments": {"nodes": comments}, "reviews": {"nodes": []}, "reviewThreads": {"nodes": []}}]}
        result = list(records(history))
        self.assertTrue(result[0]["isBot"])
        self.assertTrue(result[1]["isAuthor"])
        self.assertFalse(result[2]["isBot"])
        self.assertFalse(result[2]["isAuthor"])


if __name__ == "__main__":
    unittest.main()