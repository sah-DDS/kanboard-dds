<?php

namespace Kanboard\Controller;

/**
 * Browser notification controller
 *
 * @package  Kanboard\Controller
 */
class BrowserNotificationController extends BaseController
{
    /**
     * Stream browser notifications for the current user
     *
     * @access public
     */
    public function stream()
    {
        if (! $this->userSession->isLogged()) {
            $this->response->json(array('message' => t('Access Forbidden')), 403);
            return;
        }

        $user_id = $this->userSession->getId();
        $types = $this->userNotificationTypeModel->getSelectedTypes($user_id);
        if (! in_array('browser', $types, true)) {
            $this->response->json(array('message' => t('Notifications disabled')), 204);
            return;
        }

        $last_id = $this->request->getIntegerParam('last_id', 0);
        $timeout = 300;  // 5 minutes instead of 25 seconds to reduce reconnections
        $start = time();
        $poll_interval = 4;  // Check every 4 seconds instead of 2 to reduce DB load

        @set_time_limit(0);

        @ini_set('output_buffering', 'off');
        @ini_set('zlib.output_compression', 0);
        @ini_set('implicit_flush', 1);
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        ob_implicit_flush(true);

        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');

        while (time() - $start < $timeout) {
            $notifications = $this->userBrowserNotificationModel->getAllAfterId($user_id, $last_id);

            if (! empty($notifications)) {
                $payload = $this->formatPayload($notifications);
                $last_id = $payload['last_id'];

                echo "event: notifications\n";
                echo 'data: '.json_encode($payload)."\n\n";

                $this->userBrowserNotificationModel->removeByIds($user_id, $payload['ids']);
                return;
            }

            echo ": ping\n\n";
            sleep($poll_interval);
        }
    }

    private function formatPayload(array $notifications)
    {
        $items = array();
        $ids = array();
        $last_id = 0;

        foreach ($notifications as $notification) {
            $ids[] = $notification['id'];
            $last_id = $notification['id'];
            $items[] = array(
                'id' => $notification['id'],
                'title' => $this->getNotificationTitle($notification),
                'body' => $notification['title'],
                'url' => $this->getNotificationUrl($notification),
                'date' => $notification['date_creation'],
            );
        }

        return array(
            'items' => $items,
            'ids' => $ids,
            'last_id' => $last_id,
        );
    }

    private function getNotificationTitle(array $notification)
    {
        if (isset($notification['event_data']['task']['project_name'])) {
            return $notification['event_data']['task']['project_name'];
        }

        if (isset($notification['event_data']['project_name'])) {
            return $notification['event_data']['project_name'];
        }

        return t('Kanboard');
    }

    private function getNotificationUrl(array $notification)
    {
        $task_id = $this->notificationModel->getTaskIdFromEvent($notification['event_name'], $notification['event_data']);

        if ($task_id > 0) {
            $url = $this->helper->url->to('TaskViewController', 'show', array('task_id' => $task_id));

            if (isset($notification['event_data']['comment']['id'])) {
                return $url.'#comment-'.$notification['event_data']['comment']['id'];
            }

            return $url;
        }

        return $this->helper->url->to('DashboardController', 'show');
    }
}
